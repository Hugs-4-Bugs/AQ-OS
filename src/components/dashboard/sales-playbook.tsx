'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Play,
  CheckCircle2,
  Clock,
  Star,
  ChevronRight,
  ChevronLeft,
  Lightbulb,
  Target,
  Users,
  BarChart3,
  Zap,
  Trophy,
  TrendingUp,
  ArrowRight,
  Filter,
  Layers,
  Calendar,
  Timer,
} from 'lucide-react';

/* ===== Types ===== */
type StageFilter = 'all' | 'discovery' | 'qualification' | 'proposal' | 'negotiation';
type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

interface PlayMethod {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  successRate: number;
  stepsCount: number;
  duration: string;
  stage: StageFilter;
  color: string;
}

interface ActivePlay {
  id: string;
  methodId: string;
  title: string;
  currentStep: number;
  totalSteps: number;
  stepTitle: string;
  stepDescription: string;
  nextAction: string;
  suggestedTiming: string;
  startedDate: string;
  expectedCompletion: string;
  progress: number;
  color: string;
}

interface TeamMember {
  name: string;
  avatar: string;
  adoption: number;
  favoritePlay: string;
}

interface Tip {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

interface SalesPlaybookData {
  playMethods: PlayMethod[];
  activePlays: ActivePlay[];
  teamAdoption: TeamMember[];
  tips: Tip[];
}

const STAGE_TABS: { key: StageFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
];

const TIP_ICON_MAP: Record<string, React.ElementType> = {
  Lightbulb,
  Target,
  Users,
  BarChart3,
  Zap,
  TrendingUp,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

/* ===== Loading Skeleton ===== */
function PlaybookSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div>
            <Skeleton className="h-5 w-36 mb-1" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/* ===== Main Component ===== */
export default function SalesPlaybook() {
  const [data, setData] = useState<SalesPlaybookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StageFilter>('all');
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    fetch('/api/dashboard/sales-playbook')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const PLAY_METHODS: PlayMethod[] = data?.playMethods ?? [];
  const ACTIVE_PLAYS: ActivePlay[] = data?.activePlays ?? [];
  const TEAM_ADOPTION: TeamMember[] = data?.teamAdoption ?? [];
  const TIPS: Tip[] = (data?.tips ?? []).map(t => ({
    ...t,
    icon: typeof t.icon === 'string'
      ? (TIP_ICON_MAP[t.icon as string] ?? Lightbulb)
      : (t.icon ?? Lightbulb),
  }));

  const filteredMethods = PLAY_METHODS.filter(
    (m) => activeTab === 'all' || m.stage === activeTab
  );

  const avgCompletionRate = ACTIVE_PLAYS.length > 0
    ? Math.round(ACTIVE_PLAYS.reduce((sum, play) => sum + play.progress, 0) / ACTIVE_PLAYS.length)
    : 0;

  const mostPopularPlay = PLAY_METHODS.length > 0 ? PLAY_METHODS[0].title : 'N/A';

  const nextTip = useCallback(() => {
    if (TIPS.length === 0) return;
    setCurrentTipIndex((prev) => (prev + 1) % TIPS.length);
  }, [TIPS.length]);

  const prevTip = useCallback(() => {
    if (TIPS.length === 0) return;
    setCurrentTipIndex((prev) => (prev - 1 + TIPS.length) % TIPS.length);
  }, [TIPS.length]);

  useEffect(() => {
    if (TIPS.length === 0) return;
    const timer = setInterval(nextTip, 6000);
    return () => clearInterval(timer);
  }, [nextTip, TIPS.length]);

  const getDifficultyColor = (difficulty: Difficulty) => {
    const colors: Record<Difficulty, string> = {
      Beginner: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      Intermediate: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      Advanced: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    };
    return colors[difficulty];
  };

  const getStageColor = (stage: StageFilter) => {
    const colors: Record<StageFilter, string> = {
      all: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      discovery: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      qualification: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
      proposal: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      negotiation: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return colors[stage];
  };

  const currentTip = TIPS.length > 0 ? TIPS[currentTipIndex % TIPS.length] : null;
  const CurrentTipIcon = currentTip?.icon ?? Lightbulb;

  if (loading) return <PlaybookSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Sales Playbook</h2>
              <p className="text-xs text-muted-foreground">{PLAY_METHODS.length} play methods · {ACTIVE_PLAYS.length} active</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Filter className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as StageFilter)}
                className="appearance-none pl-8 pr-8 py-1.5 rounded-lg border border-border/50 bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 cursor-pointer"
              >
                {STAGE_TABS.map((tab) => (
                  <option key={tab.key} value={tab.key}>{tab.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stage Filter Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.06 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-2"
      >
        <div className="flex items-center gap-1 overflow-x-auto">
          {STAGE_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'all'
              ? PLAY_METHODS.length
              : PLAY_METHODS.filter((m) => m.stage === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 whitespace-nowrap cursor-pointer',
                  isActive
                    ? 'bg-violet-500/10 text-violet-500 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {tab.label}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-4 px-1.5 border-0',
                    isActive ? 'bg-violet-500/20 text-violet-500' : 'bg-muted/50 text-muted-foreground'
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Play Method Cards */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Available Play Methods</h3>
        </div>
        {filteredMethods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Layers className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No play methods available</p>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {filteredMethods.map((method) => (
              <motion.div
                key={method.id}
                variants={itemVariants}
                className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden group hover:shadow-xl hover:border-violet-500/20 transition-all duration-300"
              >
                {/* Top gradient bar */}
                <div className={cn('h-1.5 bg-gradient-to-r', method.color)} />

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-bold group-hover:text-violet-500 transition-colors">{method.title}</h4>
                    <Badge className={cn('text-[9px] border shrink-0', getDifficultyColor(method.difficulty))}>
                      {method.difficulty}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-3">
                    {method.description}
                  </p>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center p-1.5 rounded-lg bg-muted/30">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500 mx-auto mb-0.5" />
                      <p className="text-xs font-bold">{method.successRate}%</p>
                      <p className="text-[9px] text-muted-foreground">Success</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/30">
                      <Layers className="h-3.5 w-3.5 text-blue-500 mx-auto mb-0.5" />
                      <p className="text-xs font-bold">{method.stepsCount}</p>
                      <p className="text-[9px] text-muted-foreground">Steps</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-muted/30">
                      <Timer className="h-3.5 w-3.5 text-amber-500 mx-auto mb-0.5" />
                      <p className="text-xs font-bold">{method.duration}</p>
                      <p className="text-[9px] text-muted-foreground">Duration</p>
                    </div>
                  </div>

                  <Button className="w-full text-xs h-8 gap-1.5 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0 hover:shadow-lg hover:shadow-violet-500/20 transition-shadow">
                    <Play className="h-3.5 w-3.5" />
                    Start Play
                  </Button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Active Plays Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Active Plays</h3>
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">{ACTIVE_PLAYS.length} in progress</Badge>
        </div>
        {ACTIVE_PLAYS.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Zap className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No active plays</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {ACTIVE_PLAYS.map((play, index) => (
              <motion.div
                key={play.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 + index * 0.07 }}
                className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden"
              >
                {/* Progress Header */}
                <div className={cn('h-1.5 bg-muted/30 relative overflow-hidden')}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${play.progress}%` }}
                    transition={{ duration: 0.8, delay: 0.3 + index * 0.1, ease: 'easeOut' }}
                    className={cn('absolute inset-y-0 left-0 bg-gradient-to-r', play.color)}
                  />
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold">{play.title}</h4>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      Step {play.currentStep} of {play.totalSteps}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden mb-3">
                    <div
                      className={cn('h-full rounded-full bg-gradient-to-r', play.color)}
                      style={{ width: `${play.progress}%` }}
                    />
                  </div>

                  {/* Current Step */}
                  <div className="rounded-lg bg-muted/30 p-3 mb-3">
                    <p className="text-xs font-semibold mb-0.5">{play.stepTitle}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{play.stepDescription}</p>
                  </div>

                  {/* Next Action */}
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRight className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{play.nextAction}</p>
                      <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {play.suggestedTiming}
                      </p>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/30">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {play.startedDate}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      {play.expectedCompletion}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Team Adoption Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold">Team Adoption</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px]">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-muted-foreground">Most Popular:</span>
              <span className="font-semibold">{mostPopularPlay}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-muted-foreground">Avg Completion:</span>
              <span className="font-semibold">{avgCompletionRate}%</span>
            </div>
          </div>
        </div>

        {TEAM_ADOPTION.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No team adoption data available</p>
          </div>
        ) : (
          /* Bar Chart */
          <div className="space-y-3">
            {TEAM_ADOPTION.map((member, index) => (
              <div key={member.name} className="flex items-center gap-3">
                <div className="flex items-center gap-2 w-36 shrink-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white">
                    {member.avatar}
                  </div>
                  <span className="text-xs font-medium truncate">{member.name}</span>
                </div>
                <div className="flex-1">
                  <div className="w-full h-6 bg-muted/40 rounded-lg overflow-hidden relative">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${member.adoption}%` }}
                      transition={{ duration: 0.6, delay: 0.3 + index * 0.08, ease: 'easeOut' }}
                      className={cn(
                        'h-full rounded-lg flex items-center justify-end pr-2',
                        index === 0
                          ? 'bg-gradient-to-r from-violet-500 to-purple-500'
                          : 'bg-gradient-to-r from-blue-500/60 to-cyan-500/60'
                      )}
                    >
                      <span className="text-[9px] font-bold text-white">{member.adoption}%</span>
                    </motion.div>
                  </div>
                </div>
                <span className="text-[9px] text-muted-foreground w-24 text-right truncate">{member.favoritePlay}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Tips Carousel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">Sales Tips</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={prevTip}
              className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={nextTip}
              className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {TIPS.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Lightbulb className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-xs">No sales tips available</p>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden">
              <motion.div
                key={currentTip?.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-4 p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/10"
              >
                <div className="rounded-xl p-3 bg-amber-500/10 shrink-0">
                  <CurrentTipIcon className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-1">{currentTip?.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{currentTip?.description}</p>
                </div>
              </motion.div>
            </div>

            {/* Navigation Dots */}
            <div className="flex items-center justify-center gap-1.5 mt-4">
              {TIPS.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentTipIndex(index)}
                  className={cn(
                    'rounded-full transition-all duration-200 cursor-pointer',
                    index === currentTipIndex
                      ? 'w-6 h-2 bg-violet-500'
                      : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  )}
                />
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
