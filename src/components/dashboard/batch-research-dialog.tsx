'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Batch Deep Research dialog
// Select leads in the Leads tab → "Deep Research" → pick depth →
// confirm the credit estimate (Section 18) → live per-lead progress.
// ═══════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Loader2,
  Play,
  Search,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { ResearchDepth } from '@/lib/prospecting/types';

const COSTS: Record<ResearchDepth, number> = { quick: 5, deep: 7 };

interface JobState {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  depth: ResearchDepth;
  total: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  results: Array<{
    leadId: string;
    businessName: string;
    status: 'completed' | 'failed' | 'skipped' | 'needs_review';
    error?: string;
  }>;
  error?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
}

export default function BatchResearchDialog({ open, onOpenChange, leadIds }: Props) {
  const queryClient = useQueryClient();
  const [depth, setDepth] = useState<ResearchDepth>('deep');
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll while the job is live
  useEffect(() => {
    if (!job || (job.status !== 'running' && job.status !== 'queued')) return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/prospecting/research-batch/status?jobId=${job.id}`);
        if (res.ok) {
          const data = await res.json();
          setJob(data.job as JobState);
          if (data.job?.status === 'completed') {
            toast.success('Batch research finished', {
              description: `${data.job.completedCount} completed · ${data.job.failedCount} failed · ${data.job.skippedCount} skipped`,
            });
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            return; // stop polling
          }
        }
      } catch {
        // transient — keep polling
      }
      timerRef.current = setTimeout(tick, 3000);
    };
    timerRef.current = setTimeout(tick, 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [job, queryClient]);

  const start = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/prospecting/research-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds, depth }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to start batch research');
        return;
      }
      toast.success('Batch research started', {
        description: `${leadIds.length} lead${leadIds.length === 1 ? '' : 's'} · ${depth} depth`,
      });
      setJob({
        id: data.jobId,
        status: 'queued',
        depth,
        total: data.total ?? leadIds.length,
        completedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        results: [],
      });
    } finally {
      setStarting(false);
    }
  };

  const done = job && (job.status === 'completed' || job.status === 'failed');
  const processed = job ? job.completedCount + job.failedCount + job.skippedCount : 0;
  const estimatedCost = leadIds.length * COSTS[depth];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o || done || !job) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        {!job ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Deep Research {leadIds.length} Lead{leadIds.length === 1 ? '' : 's'}
              </DialogTitle>
              <DialogDescription>
                The pipeline visits each company&apos;s website, builds a full research profile,
                detects evidence-based gaps, maps them to your services, and drafts outreach.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/60 border border-border/50 w-full">
                <button
                  type="button"
                  onClick={() => setDepth('deep')}
                  className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    depth === 'deep' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Deep Research <Badge variant="secondary" className="text-[10px]">{COSTS.deep} cr/lead</Badge>
                </button>
                <button
                  type="button"
                  onClick={() => setDepth('quick')}
                  className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    depth === 'quick' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  Quick <Badge variant="secondary" className="text-[10px]">{COSTS.quick} cr/lead</Badge>
                </button>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm flex items-center justify-between">
                <span>Estimated cost</span>
                <span className="font-semibold">{leadIds.length} × {COSTS[depth]} = <span className="text-primary">{estimatedCost} credits</span></span>
              </div>
              <Button className="w-full gap-2" onClick={start} disabled={starting || leadIds.length === 0}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Research
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Runs in the background with limited concurrency. Failed leads are refunded automatically.
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {job.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                Batch research {job.status}
              </DialogTitle>
              <DialogDescription>
                {job.completedCount} completed · {job.failedCount} failed · {job.skippedCount} skipped / {job.total} total
              </DialogDescription>
            </DialogHeader>
            <Progress value={job.total ? Math.round((processed / job.total) * 100) : 0} className="h-2" />
            <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-md border p-2">
              {job.results.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Starting research…</p>
              )}
              {job.results.map((r) => (
                <div key={r.leadId} className="flex items-center gap-2 text-xs">
                  {r.status === 'completed' ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                  ) : r.status === 'failed' ? (
                    <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  ) : r.status === 'needs_review' ? (
                    <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                  ) : (
                    <MinusCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{r.businessName}</span>
                  <span className="text-muted-foreground shrink-0">
                    {r.status === 'needs_review' ? 'insufficient data' : r.status}
                  </span>
                </div>
              ))}
            </div>
            {job.error && <p className="text-[11px] text-amber-600">{job.error}</p>}
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)} disabled={!done}>
              {done ? 'Close' : 'Running…'}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
