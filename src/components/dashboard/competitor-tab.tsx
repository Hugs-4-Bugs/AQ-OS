'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Search,
  ExternalLink,
  Globe,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  Plus,
  Loader2,
  Sparkles,
  ChevronDown,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchCompetitorAnalyses,
  createCompetitorAnalysis,
  deleteCompetitorAnalysis,
} from '@/lib/api';
import type { CompetitorAnalysis, ThreatLevel } from '@/lib/types';
import PlanGate from './plan-gate';
import CreditCostBadge from './credit-cost-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSubscriptionStore } from '@/lib/subscription-store';

// ─── Threat level config ─────────────────────────────────────
const THREAT_CONFIG: Record<ThreatLevel, { color: string; bg: string; label: string }> = {
  low: { color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Low' },
  medium: { color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Medium' },
  high: { color: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20', label: 'High' },
};

const TRAFFIC_TIER_CONFIG: Record<string, { color: string; label: string }> = {
  low: { color: 'text-emerald-500', label: 'Low' },
  medium: { color: 'text-amber-500', label: 'Medium' },
  high: { color: 'text-red-500', label: 'High' },
};

const TECH_COLORS: string[] = [
  'bg-purple-500/10 text-purple-600 border-purple-500/20',
  'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  'bg-amber-500/10 text-amber-600 border-amber-500/20',
  'bg-rose-500/10 text-rose-600 border-rose-500/20',
  'bg-sky-500/10 text-sky-600 border-sky-500/20',
  'bg-violet-500/10 text-violet-600 border-violet-500/20',
  'bg-teal-500/10 text-teal-600 border-teal-500/20',
];

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function getScoreProgressClass(score: number): string {
  if (score >= 70) return '[&>div]:bg-emerald-500';
  if (score >= 40) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

// ─── Analysis Detail View ────────────────────────────────────
function AnalysisDetailView({ analysis, onClose }: { analysis: CompetitorAnalysis; onClose: () => void }) {
  const threatConfig = analysis.threatLevel ? THREAT_CONFIG[analysis.threatLevel] : null;
  const techStack = analysis.techStack || [];
  const strengths = analysis.strengths || [];
  const weaknesses = analysis.weaknesses || [];
  const opportunities = analysis.opportunities || [];
  const threats = analysis.threats || [];
  const diffOpps = analysis.differentiationOpportunities || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
    >
      <ScrollArea className="h-full">
        <div className="p-4 sm:p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-purple-500" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold truncate">{analysis.competitorName}</h2>
                <a
                  href={analysis.competitorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm text-muted-foreground hover:text-purple-500 flex items-center gap-1 transition-colors truncate"
                >
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">{analysis.competitorUrl.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">
              ← Back
            </Button>
          </div>

          {/* Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* SEO Score */}
            <Card className="card-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">SEO Score</span>
                </div>
                <div className={cn('text-2xl font-bold', getScoreColor(analysis.seoScore ?? 0))}>
                  {analysis.seoScore ?? '—'}
                </div>
                <Progress value={analysis.seoScore ?? 0} className={cn('h-1.5 mt-2', getScoreProgressClass(analysis.seoScore ?? 0))} />
              </CardContent>
            </Card>

            {/* Social Activity */}
            <Card className="card-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Social Activity</span>
                </div>
                <div className={cn('text-2xl font-bold', getScoreColor(analysis.socialScore ?? 0))}>
                  {analysis.socialScore ?? '—'}
                </div>
                <Progress value={analysis.socialScore ?? 0} className={cn('h-1.5 mt-2', getScoreProgressClass(analysis.socialScore ?? 0))} />
              </CardContent>
            </Card>

            {/* Tech Stack */}
            <Card className="card-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Tech Stack</span>
                </div>
                <div className="text-2xl font-bold text-purple-600">
                  {techStack.length}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">technologies detected</p>
              </CardContent>
            </Card>

            {/* Threat Level */}
            <Card className="card-glow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-muted-foreground">Threat Level</span>
                </div>
                {threatConfig ? (
                  <Badge className={cn('text-lg px-3 py-1 border font-bold', threatConfig.bg, threatConfig.color)}>
                    {threatConfig.label}
                  </Badge>
                ) : (
                  <span className="text-2xl font-bold">—</span>
                )}
              </CardContent>
            </Card>
          </div>

          {/* SWOT Analysis */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-purple-500" />
                SWOT Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Strengths */}
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <h4 className="text-sm font-semibold text-emerald-600">Strengths</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {strengths.map((s, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5">•</span>
                        {s}
                      </li>
                    ))}
                    {strengths.length === 0 && <li className="text-xs text-muted-foreground italic">No data</li>}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <h4 className="text-sm font-semibold text-red-600">Weaknesses</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {weaknesses.map((w, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-red-500 mt-0.5">•</span>
                        {w}
                      </li>
                    ))}
                    {weaknesses.length === 0 && <li className="text-xs text-muted-foreground italic">No data</li>}
                  </ul>
                </div>

                {/* Opportunities */}
                <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-cyan-500" />
                    <h4 className="text-sm font-semibold text-cyan-600">Opportunities</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {opportunities.map((o, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-cyan-500 mt-0.5">•</span>
                        {o}
                      </li>
                    ))}
                    {opportunities.length === 0 && <li className="text-xs text-muted-foreground italic">No data</li>}
                  </ul>
                </div>

                {/* Threats */}
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h4 className="text-sm font-semibold text-amber-600">Threats</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {threats.map((t, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5">•</span>
                        {t}
                      </li>
                    ))}
                    {threats.length === 0 && <li className="text-xs text-muted-foreground italic">No data</li>}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tech Stack Detected */}
          {techStack.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  Tech Stack Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {techStack.map((tech, i) => (
                    <Badge
                      key={tech}
                      variant="outline"
                      className={cn('text-xs font-medium', TECH_COLORS[i % TECH_COLORS.length])}
                    >
                      {tech}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Differentiation Opportunities */}
          {diffOpps.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                  Differentiation Opportunities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {diffOpps.map((d, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-purple-500/10 text-purple-600 text-[10px] font-bold shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{d}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Pricing & Traffic Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Pricing Model */}
            {analysis.pricingModel && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground">💰 Pricing Model</span>
                  </div>
                  <p className="text-sm font-medium">{analysis.pricingModel}</p>
                </CardContent>
              </Card>
            )}

            {/* Estimated Traffic */}
            {analysis.estimatedTrafficTier && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground">🌐 Estimated Traffic</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-bold',
                        TRAFFIC_TIER_CONFIG[analysis.estimatedTrafficTier]?.color || 'text-muted-foreground',
                        analysis.estimatedTrafficTier === 'low' && 'border-emerald-500/20 bg-emerald-500/5',
                        analysis.estimatedTrafficTier === 'medium' && 'border-amber-500/20 bg-amber-500/5',
                        analysis.estimatedTrafficTier === 'high' && 'border-red-500/20 bg-red-500/5',
                      )}
                    >
                      <Globe className="h-3 w-3 mr-1" />
                      {TRAFFIC_TIER_CONFIG[analysis.estimatedTrafficTier]?.label || analysis.estimatedTrafficTier}
                    </Badge>
                    <span className="text-xs text-muted-foreground">monthly visitors</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Analyzed date */}
          <p className="text-xs text-muted-foreground text-center pt-2">
            Analyzed on {new Date(analysis.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </ScrollArea>
    </motion.div>
  );
}

// ─── Competitor List Row ────────────────────────────────────
function CompetitorRow({
  analysis,
  onView,
  onDelete,
}: {
  analysis: CompetitorAnalysis;
  onView: () => void;
  onDelete: () => void;
}) {
  const threatConfig = analysis.threatLevel ? THREAT_CONFIG[analysis.threatLevel] : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
        'hover:bg-accent/50 hover:shadow-sm group cursor-pointer',
        'border-border/50'
      )}
      onClick={onView}
    >
      {/* Icon */}
      <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
        <Shield className="h-5 w-5 text-purple-500" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{analysis.competitorName}</span>
          {threatConfig && (
            <Badge className={cn('text-[10px] px-1.5 py-0 h-4 border font-semibold', threatConfig.bg, threatConfig.color)}>
              {threatConfig.label}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{analysis.competitorUrl}</p>
      </div>

      {/* Scores */}
      <div className="hidden sm:flex items-center gap-4">
        <div className="text-center">
          <div className={cn('text-sm font-bold', getScoreColor(analysis.seoScore ?? 0))}>
            {analysis.seoScore ?? '—'}
          </div>
          <div className="text-[9px] text-muted-foreground">SEO</div>
        </div>
        <div className="text-center">
          <div className={cn('text-sm font-bold', getScoreColor(analysis.socialScore ?? 0))}>
            {analysis.socialScore ?? '—'}
          </div>
          <div className="text-[9px] text-muted-foreground">Social</div>
        </div>
      </div>

      {/* Date */}
      <div className="hidden md:block text-[10px] text-muted-foreground whitespace-nowrap">
        {new Date(analysis.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 group-hover:sm:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onView(); }}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Main Competitor Tab ────────────────────────────────────
export default function CompetitorTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterThreat, setFilterThreat] = useState<string>('all');
  const [formData, setFormData] = useState({
    competitorName: '',
    competitorUrl: '',
    yourBusinessName: '',
    yourWebsiteUrl: '',
  });

  const currentPlan = useSubscriptionStore((s) => s.currentPlan);
  const isProOrAbove = currentPlan !== 'free';

  // Fetch analyses
  const { data: analyses = [], isLoading } = useQuery({
    queryKey: ['competitor-analyses'],
    queryFn: fetchCompetitorAnalyses,
  });

  // Use analyses directly from API
  const allAnalyses = analyses;

  // Filter analyses
  const filteredAnalyses = useMemo(() => {
    let result = allAnalyses;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.competitorName.toLowerCase().includes(q) ||
          a.competitorUrl.toLowerCase().includes(q)
      );
    }
    if (filterThreat !== 'all') {
      result = result.filter((a) => a.threatLevel === filterThreat);
    }
    return result;
  }, [allAnalyses, searchQuery, filterThreat]);

  // Create analysis mutation
  const createMutation = useMutation({
    mutationFn: createCompetitorAnalysis,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitor-analyses'] });
      toast.success('Competitor analysis created successfully!');
      setDialogOpen(false);
      setFormData({ competitorName: '', competitorUrl: '', yourBusinessName: '', yourWebsiteUrl: '' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create analysis');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteCompetitorAnalysis,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitor-analyses'] });
      toast.success('Analysis deleted');
      setDeleteId(null);
      if (selectedAnalysis && deleteId === selectedAnalysis.id) {
        setSelectedAnalysis(null);
      }
    },
    onError: () => {
      toast.error('Failed to delete analysis');
    },
  });

  const handleSubmit = () => {
    if (!formData.competitorName.trim() || !formData.competitorUrl.trim()) {
      toast.error('Competitor name and URL are required');
      return;
    }
    createMutation.mutate({
      competitorName: formData.competitorName.trim(),
      competitorUrl: formData.competitorUrl.trim(),
      yourBusinessName: formData.yourBusinessName.trim() || undefined,
      yourWebsiteUrl: formData.yourWebsiteUrl.trim() || undefined,
    });
  };

  // If viewing a specific analysis, show detail view
  if (selectedAnalysis) {
    return (
      <div className="h-full">
        <AnalysisDetailView
          analysis={selectedAnalysis}
          onClose={() => setSelectedAnalysis(null)}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Competitor Intelligence</h1>
              <p className="text-sm text-muted-foreground">
                Analyze your competitors and find opportunities to win
              </p>
            </div>
          </div>

          <PlanGate requiredPlan="pro" featureName="Competitor Analysis"
            fallback={
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <Button className="gap-2 bg-purple-600 hover:bg-purple-700" onClick={() => {}}>
                  <Search className="h-4 w-4" />
                  New Analysis
                </Button>
                <CreditCostBadge action="competitor_analysis" />
              </div>
            }
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2 bg-purple-600 hover:bg-purple-700">
                    <Search className="h-4 w-4" />
                    New Analysis
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-purple-500" />
                      Analyze Competitor
                    </DialogTitle>
                    <DialogDescription>
                      Enter your competitor&apos;s details to generate a comprehensive intelligence report.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="comp-name" className="text-sm font-medium">
                        Competitor Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="comp-name"
                        placeholder="e.g. Competitor Name"
                        value={formData.competitorName}
                        onChange={(e) => setFormData((d) => ({ ...d, competitorName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="comp-url" className="text-sm font-medium">
                        Competitor Website URL <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="comp-url"
                        placeholder="https://competitor.com"
                        value={formData.competitorUrl}
                        onChange={(e) => setFormData((d) => ({ ...d, competitorUrl: e.target.value }))}
                      />
                    </div>
                    <Separator />
                    <p className="text-xs text-muted-foreground">Optional: Provide your details for comparison insights</p>
                    <div className="space-y-2">
                      <Label htmlFor="your-name" className="text-sm font-medium">Your Business Name</Label>
                      <Input
                        id="your-name"
                        placeholder="e.g. My Agency"
                        value={formData.yourBusinessName}
                        onChange={(e) => setFormData((d) => ({ ...d, yourBusinessName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="your-url" className="text-sm font-medium">Your Website URL</Label>
                      <Input
                        id="your-url"
                        placeholder="https://yourwebsite.com"
                        value={formData.yourWebsiteUrl}
                        onChange={(e) => setFormData((d) => ({ ...d, yourWebsiteUrl: e.target.value }))}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <CreditCostBadge action="competitor_analysis" />
                      <Button
                        className="gap-2 bg-purple-600 hover:bg-purple-700"
                        onClick={handleSubmit}
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Analyze Competitor
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <CreditCostBadge action="competitor_analysis" />
            </div>
          </PlanGate>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="card-glow">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">{allAnalyses.length}</div>
              <p className="text-xs text-muted-foreground">Competitors Analyzed</p>
            </CardContent>
          </Card>
          <Card className="card-glow">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-500">
                {allAnalyses.filter((a) => a.threatLevel === 'high').length}
              </div>
              <p className="text-xs text-muted-foreground">High Threat</p>
            </CardContent>
          </Card>
          <Card className="card-glow">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-500">
                {allAnalyses.filter((a) => a.threatLevel === 'medium').length}
              </div>
              <p className="text-xs text-muted-foreground">Medium Threat</p>
            </CardContent>
          </Card>
          <Card className="card-glow">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-emerald-500">
                {allAnalyses.filter((a) => a.threatLevel === 'low').length}
              </div>
              <p className="text-xs text-muted-foreground">Low Threat</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search competitors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 border-purple-500/20 focus:ring-purple-500/30"
            />
          </div>
          <Select value={filterThreat} onValueChange={setFilterThreat}>
            <SelectTrigger className="w-full sm:w-40 border-purple-500/20">
              <Filter className="h-4 w-4 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Threat Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500" /> High
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Medium
                </span>
              </SelectItem>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Low
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Competitor List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredAnalyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-4">
              <div className="h-20 w-20 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                <Shield className="h-10 w-10 text-purple-500/50" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Plus className="h-3 w-3 text-purple-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-1">
              {searchQuery || filterThreat !== 'all' ? 'No matching competitors' : 'Start Analyzing Competitors'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {searchQuery || filterThreat !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Add your first competitor to get AI-powered insights on their strengths, weaknesses, and opportunities for your business.'}
            </p>
            {(searchQuery || filterThreat !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setSearchQuery(''); setFilterThreat('all'); }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredAnalyses.map((analysis) => (
                <CompetitorRow
                  key={analysis.id}
                  analysis={analysis}
                  onView={() => setSelectedAnalysis(analysis)}
                  onDelete={() => setDeleteId(analysis.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Quick Competitive Insights */}
        {allAnalyses.length > 0 && (
          <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-purple-600">
                <Sparkles className="h-4 w-4" />
                Quick Competitive Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <span className="font-semibold text-foreground">Highest SEO Threat</span>
                  <p className="flex items-center gap-1.5">
                    {(() => {
                      const highest = [...allAnalyses].sort((a, b) => (b.seoScore ?? 0) - (a.seoScore ?? 0))[0];
                      return highest ? (
                        <>
                          <Shield className="h-3 w-3 text-purple-500" />
                          <span className="font-medium text-foreground">{highest.competitorName}</span>
                          <span className="text-purple-600">({highest.seoScore})</span>
                        </>
                      ) : '—';
                    })()}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <span className="font-semibold text-foreground">Most Social Active</span>
                  <p className="flex items-center gap-1.5">
                    {(() => {
                      const top = [...allAnalyses].sort((a, b) => (b.socialScore ?? 0) - (a.socialScore ?? 0))[0];
                      return top ? (
                        <>
                          <TrendingUp className="h-3 w-3 text-purple-500" />
                          <span className="font-medium text-foreground">{top.competitorName}</span>
                          <span className="text-purple-600">({top.socialScore})</span>
                        </>
                      ) : '—';
                    })()}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <span className="font-semibold text-foreground">Biggest Opportunity</span>
                  <p className="flex items-center gap-1.5">
                    {(() => {
                      const low = [...allAnalyses].sort((a, b) => (a.seoScore ?? 0) - (b.seoScore ?? 0))[0];
                      return low ? (
                        <>
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                          <span className="font-medium text-foreground">{low.competitorName}</span>
                          <span className="text-emerald-600">(easiest to outrank)</span>
                        </>
                      ) : '—';
                    })()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Analysis</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this competitor analysis? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
