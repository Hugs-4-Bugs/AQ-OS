'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — 5-Step Prospecting Pipeline tab (Lead Detail Panel)
// STEP 1 Deep Research → STEP 2 Gap Detection → STEP 3 Offer Match
// → STEP 4 Personalized Pitch → STEP 5 Smart Email (+ send)
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search,
  AlertTriangle,
  Target,
  Megaphone,
  Mail,
  Loader2,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Copy,
  Send,
  Globe,
  ShieldCheck,
  Star,
  Users,
  IndianRupee,
  Cpu,
  Share2,
  Settings2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { Lead } from '@/lib/types';
import type {
  PipelineEmail,
  PipelineGaps,
  PipelineMatch,
  PipelinePitch,
  PipelineResearch,
  PipelineState,
  PipelineStepState,
} from '@/lib/prospecting/types';

const STEP_DEFS = [
  { step: 1, label: 'Deep Research', icon: Search },
  { step: 2, label: 'Gap Detection', icon: AlertTriangle },
  { step: 3, label: 'Offer Match', icon: Target },
  { step: 4, label: 'Pitch', icon: Megaphone },
  { step: 5, label: 'Smart Email', icon: Mail },
];

const PIPELINE_COST = 7;
const POLL_INTERVAL_MS = 3500;
const MAX_POLL_MS = 10 * 60 * 1000;

interface Props {
  lead: Lead;
}

function StepIcon({ state }: { state: PipelineStepState | undefined }) {
  if (state === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (state === 'completed') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (state === 'skipped') return <MinusCircle className="h-3.5 w-3.5 text-amber-500" />;
  if (state === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

function severityBadge(sev: string) {
  if (sev === 'critical') return <Badge className="bg-red-500/15 text-red-600 border-red-500/30" variant="outline">Critical</Badge>;
  if (sev === 'moderate') return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Moderate</Badge>;
  return <Badge className="bg-muted text-muted-foreground" variant="outline">Minor</Badge>;
}

export default function ProspectPipelineTab({ lead }: Props) {
  const queryClient = useQueryClient();
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const pollStartRef = useRef<number>(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/prospecting/pipeline/status?leadId=${lead.id}`);
      if (!res.ok) throw new Error('status failed');
      const data = await res.json();
      setPipeline(data.pipeline ?? null);
      return data.pipeline as PipelineState | null;
    } catch {
      return null;
    }
  }, [lead.id]);

  // Initial load + live polling while a run is in progress
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    pollStartRef.current = Date.now();

    const tick = async () => {
      const state = await fetchStatus();
      if (cancelled) return;
      setLoading(false);
      if (state?.status === 'running') {
        if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
          toast.error('Pipeline is taking unusually long. Try re-running it.');
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      } else if (state?.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['lead-activities'] });
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [lead.id, fetchStatus, queryClient]);

  // Seed editable email when a new completed pipeline arrives
  const pipelineId = pipeline?.id;
  const pipelineEmail = pipeline?.email;
  useEffect(() => {
    if (pipelineEmail) {
      setEmailDraft({ subject: pipelineEmail.subject, body: pipelineEmail.body });
    } else {
      setEmailDraft(null);
    }
  }, [pipelineId, pipelineEmail]);

  const startPipeline = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/prospecting/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to start pipeline', {
          description: data.errorCode === 'INSUFFICIENT_CREDITS' ? `Cost: ${PIPELINE_COST} credits` : undefined,
        });
        return;
      }
      toast.success('Pipeline started', { description: `5 steps running — ${PIPELINE_COST} credits used` });
      pollStartRef.current = Date.now();
      setLoading(true);
      await fetchStatus();
      // restart polling loop
      let cancelled = false;
      const tick = async () => {
        if (cancelled) return;
        const state = await fetchStatus();
        if (state?.status === 'running' && Date.now() - pollStartRef.current <= MAX_POLL_MS) {
          setTimeout(tick, POLL_INTERVAL_MS);
        } else if (state?.status === 'completed') {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        } else if (state?.status === 'running') {
          toast.error('Pipeline is taking unusually long. Try re-running it.');
        }
      };
      setTimeout(tick, POLL_INTERVAL_MS);
    } finally {
      setStarting(false);
      setLoading(false);
    }
  };

  const sendEmail = async (method: 'gmail' | 'system') => {
    if (!emailDraft?.subject || !emailDraft?.body) return;
    setSending(true);
    try {
      const res = await fetch('/api/prospecting/pipeline/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          method,
          subject: emailDraft.subject,
          body: emailDraft.body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Send failed', { description: data.hint });
        return;
      }
      toast.success(`Email sent via ${data.provider || method}`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } finally {
      setSending(false);
    }
  };

  const copyEmail = async () => {
    if (!emailDraft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${emailDraft.subject}\n\n${emailDraft.body}`);
      toast.success('Email copied to clipboard');
    } catch {
      toast.error('Could not copy');
    }
  };

  // ── Render helpers ──
  const isRunning = pipeline?.status === 'running';
  const research = pipeline?.research as PipelineResearch | null | undefined;
  const gaps = pipeline?.gaps as PipelineGaps | null | undefined;
  const match = pipeline?.match as PipelineMatch | null | undefined;
  const pitch = pipeline?.pitch as PipelinePitch | null | undefined;
  const email = pipeline?.email as PipelineEmail | null | undefined;

  if (loading && !pipeline) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading pipeline…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step tracker */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              5-Step Prospect Pipeline
            </h3>
            {pipeline?.status === 'completed' && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={startPipeline} disabled={starting}>
                <RefreshCw className="h-3 w-3" /> Re-run
              </Button>
            )}
            {pipeline?.status === 'failed' && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={startPipeline} disabled={starting}>
                <RefreshCw className="h-3 w-3" /> Retry
              </Button>
            )}
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {STEP_DEFS.map(({ step, label, icon: Icon }) => {
              const state = pipeline?.stepStatus?.[String(step)];
              return (
                <div
                  key={step}
                  className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center ${
                    state === 'running' ? 'border-primary/50 bg-primary/5' : state === 'completed' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'
                  }`}
                >
                  <StepIcon state={state} />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[9px] leading-tight text-muted-foreground">{label}</span>
                </div>
              );
            })}
          </div>
          {isRunning && pipeline?.progress !== undefined && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(pipeline.progress, 4)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Step {pipeline.currentStep} of 5 running… you can close this panel; we&apos;ll notify you when done.
              </p>
            </div>
          )}
          {pipeline?.status === 'failed' && (
            <p className="text-xs text-red-500 flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {pipeline.error || 'Pipeline failed'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Never run → intro CTA */}
      {!pipeline || pipeline.status === 'idle' ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Play className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-medium">Run the 5-step AI prospect pipeline</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              We visit the company&apos;s website, research what they sell, detect real gaps,
              match them to your offers, and write a personalized pitch + email.
            </p>
            <Button onClick={startPipeline} disabled={starting} className="gap-2">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Pipeline
              <Badge variant="secondary" className="ml-1">{PIPELINE_COST} credits</Badge>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* STEP 3 match banner */}
      {match && !match.skipped && pipeline?.status === 'completed' && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Offer Match
              </h4>
              <div className="flex items-center gap-2">
                <Badge variant={pipeline.temperature === 'hot' ? 'default' : 'outline'}>
                  {pipeline.temperature === 'hot' ? '🔥 Hot' : pipeline.temperature === 'warm' ? 'Warm' : 'Cold'}
                </Badge>
                <span className="text-lg font-bold text-primary">{match.matchScore}<span className="text-xs text-muted-foreground">/100</span></span>
              </div>
            </div>
            {match.opportunityStatement && (
              <p className="text-sm font-medium">{match.opportunityStatement}</p>
            )}
            <div className="space-y-2 pt-1">
              {match.matches.map((m, i) => (
                <div key={i} className="rounded-md border p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{m.offerLabel}</span>
                    <Badge variant="outline" className={m.matchStrength === 'strong' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : ''}>
                      {m.matchStrength}
                    </Badge>
                  </div>
                  {m.rationale && <p className="text-xs text-muted-foreground">{m.rationale}</p>}
                  {m.matchedGaps.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">Fixes: {m.matchedGaps.join(' · ')}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {match?.skipped && pipeline?.status === 'completed' && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <Settings2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Offer profile not set up</p>
              <p className="text-xs text-muted-foreground">{match.skipReason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 research */}
      {research && pipeline?.status === 'completed' && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5" /> Company Research
              </h4>
              <div className="flex gap-1">
                {research.dataSources.websiteFetched && (
                  <Badge variant="outline" className="text-[9px] gap-0.5"><Globe className="h-2.5 w-2.5" /> Site fetched</Badge>
                )}
                {research.dataSources.webSearchUsed && (
                  <Badge variant="outline" className="text-[9px]">Web search</Badge>
                )}
                <Badge variant="outline" className="text-[9px]">{research.confidence} confidence</Badge>
              </div>
            </div>
            {research.summary && <p className="text-sm">{research.summary}</p>}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoRow icon={BuildingIcon} label="Business type" value={research.businessType} />
              <InfoRow icon={Users} label="Team size" value={research.teamSizeEstimate} />
              <InfoRow icon={IndianRupee} label="Revenue est." value={research.revenueEstimate} />
              <InfoRow icon={Star} label="Reviews" value={research.reviewsSummary.averageRating !== 'unknown' ? `${research.reviewsSummary.averageRating} (${research.reviewsSummary.sentiment})` : 'No data found'} />
            </div>
            {research.whatTheySell.length > 0 && (
              <ChipsRow label="They sell" items={research.whatTheySell} />
            )}
            {research.services.length > 0 && (
              <ChipsRow label="Services" items={research.services} />
            )}
            {research.techStack.length > 0 && (
              <ChipsRow label="Tech stack" items={research.techStack} icon={Cpu} />
            )}
            {research.socialPresence.platforms.length > 0 && (
              <ChipsRow label="Social" items={research.socialPresence.platforms} icon={Share2} />
            )}
            {research.targetMarket !== 'unknown' && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">Target market:</span> {research.targetMarket}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2 gaps */}
      {gaps && pipeline?.status === 'completed' && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Detected Gaps
              </h4>
              <span className="text-xs text-muted-foreground">
                Digital health: <span className="font-semibold">{gaps.overallDigitalHealthScore}/100</span>
              </span>
            </div>
            {gaps.gaps.map((g, i) => (
              <div key={i} className="rounded-md border p-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug">{g.gap}</span>
                  {severityBadge(g.severity)}
                </div>
                <p className="text-[11px] text-muted-foreground"><span className="font-medium">Evidence:</span> {g.evidence}</p>
                {g.businessImpact && <p className="text-[11px] text-muted-foreground"><span className="font-medium">Impact:</span> {g.businessImpact}</p>}
              </div>
            ))}
            {gaps.strengths.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-muted-foreground mr-1">Strengths:</span>
                {gaps.strengths.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] gap-0.5">
                    <ShieldCheck className="h-2.5 w-2.5 text-emerald-500" /> {s}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 4 pitch */}
      {pitch && pipeline?.status === 'completed' && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Megaphone className="h-3.5 w-3.5" /> Personalized Pitch
            </h4>
            <p className="text-sm font-semibold">{pitch.headline}</p>
            <p className="text-sm whitespace-pre-line">{pitch.pitch}</p>
            {pitch.keyPoints.length > 0 && (
              <ul className="space-y-1">
                {pitch.keyPoints.map((k, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-primary mt-0.5">•</span> {k}
                  </li>
                ))}
              </ul>
            )}
            <Separator />
            <p className="text-xs"><span className="font-medium">Projected outcome:</span> {pitch.projectedOutcome}</p>
            <p className="text-xs"><span className="font-medium">CTA:</span> {pitch.callToAction}</p>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 email */}
      {email && pipeline?.status === 'completed' && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Smart Email Draft
              </h4>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={copyEmail}>
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Subject</label>
              <Input
                value={emailDraft?.subject ?? ''}
                onChange={(e) => setEmailDraft((p) => (p ? { ...p, subject: e.target.value } : p))}
                className="h-8 text-sm"
              />
              <p className={`text-[10px] ${(emailDraft?.subject.length ?? 0) > 60 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                {emailDraft?.subject.length ?? 0} chars (recommended ≤ 60)
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Body</label>
              <Textarea
                value={emailDraft?.body ?? ''}
                onChange={(e) => setEmailDraft((p) => (p ? { ...p, body: e.target.value } : p))}
                rows={9}
                className="text-sm min-h-[160px]"
              />
            </div>
            {email.cta && (
              <p className="text-[11px] text-muted-foreground"><span className="font-medium">Suggested CTA:</span> {email.cta}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                className="flex-1 gap-2"
                onClick={() => sendEmail('gmail')}
                disabled={sending || !emailDraft?.subject || !emailDraft?.body}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send via Gmail
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => sendEmail('system')}
                disabled={sending || !emailDraft?.subject || !emailDraft?.body}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send via System
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Gmail uses your connected account (Settings → Integrations). System email uses the platform
              sender (SMTP/Resend configured on the server). Sends are logged on the lead.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Small presentational helpers ──

function BuildingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" />
    </svg>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  if (!value || value === 'unknown') {
    return (
      <div className="flex items-start gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3 mt-0.5 shrink-0" />
        <span><span className="font-medium">{label}:</span> unknown</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
      <span><span className="font-medium text-muted-foreground">{label}:</span> {value}</span>
    </div>
  );
}

function ChipsRow({ label, items, icon: Icon }: { label: string; items: string[]; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-2.5 w-2.5" />} {label}:
      </span>
      {items.map((item, i) => (
        <Badge key={i} variant="secondary" className="text-[10px] font-normal">{item}</Badge>
      ))}
    </div>
  );
}
