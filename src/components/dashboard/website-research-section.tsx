'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Lead Website Research Section (spec §5/§7)
// Renders the evidence-grounded website research report: observed facts,
// per-contact verification status + source URLs, limitations, and a
// "Research website" action that runs POST /api/leads/[id]/research.
// Observed facts (crawler) are visually distinguished from any AI
// interpretation; nothing is presented as 100% accurate.
// ═══════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Globe, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ResearchContact {
  field: 'email' | 'phone';
  value: string;
  sources: string[];
  verificationStatus: 'verified' | 'found' | 'not_found' | 'conflicting';
  conflictWith?: string | null;
  freeMail?: boolean;
}

interface ResearchData {
  id: string;
  status: string;
  createdAt: string;
  contacts: ResearchContact[];
  pagesFetched?: string[];
  report?: {
    observedFacts?: string[];
    limitations?: string[];
  } | null;
}

function StatusIcon({ status }: { status: ResearchContact['verificationStatus'] }) {
  if (status === 'found') return <ShieldQuestion className="h-3 w-3 text-amber-500 shrink-0" />;
  if (status === 'verified') return <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />;
  if (status === 'conflicting') return <ShieldAlert className="h-3 w-3 text-orange-500 shrink-0" />;
  return <ShieldQuestion className="h-3 w-3 text-muted-foreground shrink-0" />;
}

const STATUS_LABEL: Record<ResearchContact['verificationStatus'], string> = {
  verified: 'Verified',
  found: 'Found on site (not independently verified)',
  not_found: 'Not found in pages checked',
  conflicting: 'Conflicting sources',
};

export default function WebsiteResearchSection({ leadId }: { leadId: string }) {
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/research`);
      if (res.ok) {
        const data = await res.json();
        setResearch(data.research ?? null);
      }
    } catch {
      // Section is best-effort.
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  const runResearch = async () => {
    setRunning(true);
    try {
      // One click = one logical research operation. The requestId makes the
      // server-side credit deduction idempotent for THIS run (a replayed
      // request can never double-charge); a deliberate re-run generates a
      // new id and is charged normally.
      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch(`/api/leads/${leadId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Research failed');
        return;
      }
      toast.success(
        data.status === 'failed'
          ? 'Website could not be reached — no evidence collected'
          : `Research complete (${data.contacts.filter((c: ResearchContact) => c.verificationStatus === 'found').length} contact detail(s) found)`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-primary" /> Website Research
        </h4>
        <Button
          size="sm" variant="outline" className="h-7 text-xs gap-1.5"
          onClick={runResearch} disabled={running}
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {running ? 'Researching…' : research ? 'Re-run research' : 'Research website'}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading research…
        </p>
      ) : !research ? (
        <p className="text-xs text-muted-foreground">
          No research yet. Run research to check the lead&apos;s website for contact details,
          pages, and evidence-backed observations (uses the standard research credit cost).
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {research.status === 'completed' ? 'Research complete' : research.status === 'partial' ? 'Partial results' : 'Unreachable'}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {new Date(research.createdAt).toLocaleString()}
            </span>
          </div>

          {research.contacts?.length > 0 && (
            <div className="space-y-1.5">
              {research.contacts.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <StatusIcon status={c.verificationStatus} />
                  <div className="min-w-0">
                    <span className="font-medium capitalize">{c.field}: </span>
                    {c.value ? (
                      <span className="break-all">{c.value}</span>
                    ) : (
                      <span className="text-muted-foreground">none found</span>
                    )}
                    {c.value && (
                      <span className="text-[10px] text-muted-foreground block">
                        {STATUS_LABEL[c.verificationStatus]}
                        {c.conflictWith ? ` — existing record has: ${c.conflictWith}` : ''}
                      </span>
                    )}
                    {c.sources?.length > 0 && (
                      <span className="text-[10px] text-muted-foreground block truncate" title={c.sources.join(', ')}>
                        source: {c.sources[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {research.report?.observedFacts && research.report.observedFacts.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Observed facts (crawler evidence)
              </p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                {research.report.observedFacts.map((f, i) => <li key={i} className="break-words">{f}</li>)}
              </ul>
            </div>
          )}

          {research.report?.limitations && research.report.limitations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Limitations
              </p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                {research.report.limitations.map((l, i) => <li key={i} className="break-words">{l}</li>)}
              </ul>
            </div>
          )}

          {research.pagesFetched && research.pagesFetched.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {research.pagesFetched.map((u) => (
                <a
                  key={u} href={u} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] text-primary/80 hover:text-primary underline-offset-2 hover:underline"
                >
                  {u.length > 48 ? `${u.slice(0, 48)}…` : u} <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic">
            Findings come from a bounded crawl of public pages (robots.txt respected). They are
            evidence, not guarantees — details marked &quot;found&quot; have not been independently verified.
          </p>
        </div>
      )}
    </section>
  );
}
