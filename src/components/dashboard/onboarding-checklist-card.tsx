'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Rocket,
  Loader2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  step: number;
}

interface ChecklistSummary {
  completedCount: number;
  totalCount: number;
  completionPercentage: number;
  onboardingCompleted: boolean;
  bonusCreditsAwarded: boolean;
  currentStep: number;
}

// Estimated minutes per incomplete item
const ESTIMATED_MINUTES_PER_ITEM = 1;

export default function OnboardingChecklistCard() {
  const [collapsed, setCollapsed] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings-checklist'],
    queryFn: async () => {
      const res = await fetch('/api/settings/checklist', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch checklist');
      return res.json() as Promise<{
        checklist: ChecklistItem[];
        summary: ChecklistSummary;
      }>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const checklist = data?.checklist ?? [];
  const summary = data?.summary;

  const incompleteItems = checklist.filter((item) => !item.completed);
  const estimatedMinutes = incompleteItems.length * ESTIMATED_MINUTES_PER_ITEM;

  const isAllComplete = summary?.onboardingCompleted && summary.completionPercentage === 100;

  // Don't show if onboarding is fully complete (but show sparkle first)
  const [showCompletion, setShowCompletion] = useState(false);
  const [sparkleVisible, setSparkleVisible] = useState(false);

  useEffect(() => {
    if (isAllComplete && !showCompletion) {
      setShowCompletion(true);
      setSparkleVisible(true);
      const timer = setTimeout(() => setSparkleVisible(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isAllComplete, showCompletion]);

  if (isAllComplete && !sparkleVisible) {
    return null;
  }

  return (
    <div
      className={cn('animate-fade-in relative')}
    >
      {/* Confetti sparkle animation on 100% completion */}
      {sparkleVisible && isAllComplete && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden rounded-xl">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full animate-sparkle"
              style={{
                left: `${10 + (i * 7) % 80}%`,
                top: `${20 + (i * 13) % 60}%`,
                animationDelay: `${i * 0.15}s`,
                animationDuration: `${1.5 + (i % 3) * 0.5}s`,
                backgroundColor: i % 3 === 0 ? '#a855f7' : i % 3 === 1 ? '#10b981' : '#f59e0b',
              }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-purple-500/10 rounded-xl" />
        </div>
      )}
      <Card className="glass-card overflow-hidden border-primary/20">
        <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Rocket className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  Getting Started
                  {summary && summary.completionPercentage < 100 && (
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                      {summary.completedCount}/{summary.totalCount}
                    </Badge>
                  )}
                  {summary?.bonusCreditsAwarded === false && summary.completionPercentage > 50 && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] h-5 px-1.5">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                      +25 bonus
                    </Badge>
                  )}
                </CardTitle>
                {summary && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.completionPercentage === 100
                      ? 'All done! Great job.'
                      : `${summary.completionPercentage}% complete`}
                  </p>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Progress bar */}
          {summary && (
            <div className="mt-3">
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary/70 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${summary.completionPercentage}%` }}
                >
                  {isAllComplete && (
                    <div className="w-full h-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 bg-[length:200%_100%] animate-shimmer rounded-full" />
                  )}
                </div>
              </div>
            </div>
          )}
        </CardHeader>

        <div className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100'
        )}>
          <CardContent className="pt-0 pb-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-3.5 w-40" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {checklist.map((item, index) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 py-2 px-2 rounded-lg transition-all duration-200 group',
                      item.completed
                        ? 'text-muted-foreground hover:bg-muted/30'
                        : 'text-foreground hover:bg-accent/50 hover:translate-x-0.5'
                    )}
                  >
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <div className="relative shrink-0">
                        <Circle className="h-4 w-4 text-muted-foreground/40" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="h-2 w-2 rounded-full bg-primary/60 animate-checklist-pulse" />
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'text-sm truncate',
                        item.completed && 'line-through text-muted-foreground'
                      )}>
                        {item.label}
                      </p>
                    </div>
                    {item.completed && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0">
                        Done
                      </Badge>
                    )}
                    {!item.completed && (
                      <button
                        type="button"
                        onClick={() => {
                          // Dispatch event for settings panel to navigate to the right step
                          window.dispatchEvent(new CustomEvent('onboarding-navigate', { detail: { step: item.step } }));
                          queryClient.invalidateQueries({ queryKey: ['onboarding-progress'] });
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        aria-label={`Complete: ${item.label}`}
                      >
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Estimated time remaining */}
            {summary && !summary.onboardingCompleted && summary.completionPercentage < 100 && incompleteItems.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] text-muted-foreground">
                  ~{estimatedMinutes} min remaining to complete
                </p>
              </div>
            )}

            {summary && !summary.onboardingCompleted && summary.completionPercentage < 100 && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground text-center">
                  Complete all steps to earn <span className="text-primary font-medium">+25 bonus credits</span>
                </p>
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
}
