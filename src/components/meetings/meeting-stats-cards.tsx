'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Calendar,
  Clock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Loader2,
} from 'lucide-react';

interface MeetingStats {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  thisWeek: number;
  completedThisWeek: number;
  avgDurationMinutes: number;
  trend: {
    direction: 'up' | 'down';
    value: number;
  };
}

interface StatsCardsProps {
  onStatsLoaded?: (stats: MeetingStats) => void;
}

export default function MeetingStatsCards({ onStatsLoaded }: StatsCardsProps) {
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data.stats);
      onStatsLoaded?.(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [onStatsLoaded]);

  useEffect(() => {
    let cancelled = false;
    fetchStats();
    return () => { cancelled = true; };
  }, [fetchStats]);

  const cards = [
    {
      label: 'Total Meetings',
      value: stats?.total ?? 0,
      icon: Calendar,
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    },
    {
      label: 'Scheduled',
      value: stats?.scheduled ?? 0,
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: 'This Week',
      value: stats?.thisWeek ?? 0,
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      trend: stats?.trend,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-16 mb-2" />
                <div className="h-5 bg-muted rounded w-8" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm">
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              Stats unavailable
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const hasTrend = 'trend' in card && card.trend;
        return (
          <Card key={card.label} className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                </div>
                <div className={`h-9 w-9 rounded-lg ${card.bgColor} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-4.5 w-4.5 ${card.color}`} />
                </div>
              </div>
              {hasTrend && card.trend && (
                <div className="flex items-center gap-1 mt-2">
                  {card.trend.direction === 'up' ? (
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  <span
                    className={`text-xs font-medium ${
                      card.trend.direction === 'up'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {card.trend.value}%
                  </span>
                  <span className="text-xs text-muted-foreground">vs last week</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
