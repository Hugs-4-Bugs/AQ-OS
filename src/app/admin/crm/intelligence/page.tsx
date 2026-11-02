'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState } from '@/components/admin/crm/crm-states';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFetch, fmtInt, timeAgo } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';
import { BrainCircuit, Globe, AlertCircle } from 'lucide-react';

export default function IntelligencePage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Business Intelligence"><CrmLoadingSkeleton variant="cards" /></CrmShell>;
  if (error || !data) return <CrmShell title="Business Intelligence"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const bi = data.bi;
  return (
    <CrmShell title="Business Intelligence" subtitle="BusinessProfile → WebProperty → ResearchSnapshot status" onRefresh={reload}>
      <div className="space-y-3">
        {bi.schemaDrift && (
          <Card className="border-sky-500/30 bg-sky-500/5">
            <div className="flex items-start gap-3 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
              <div className="text-xs">
                <p className="font-medium text-sky-700 dark:text-sky-300">BI tables missing from DB</p>
                <p className="mt-0.5 text-sky-700/80 dark:text-sky-300/80">WebProperty and ResearchSnapshot tables are declared in the Prisma schema (Phase 36) but haven't been pushed to SQLite. Run <code className="rounded bg-sky-500/10 px-1">npx prisma db push</code> (additive, no data loss) to enable research features.</p>
              </div>
            </div>
          </Card>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <Card><div className="p-4"><p className="text-xs text-muted-foreground">Profiles</p><p className="text-xl font-semibold tabular-nums">{fmtInt(bi.totalProfiles)}</p></div></Card>
          <Card><div className="p-4"><p className="text-xs text-muted-foreground">Web Properties</p><p className="text-xl font-semibold tabular-nums">{fmtInt(bi.totalWebProperties)}</p></div></Card>
          <Card><div className="p-4"><p className="text-xs text-muted-foreground">Research Snapshots</p><p className="text-xl font-semibold tabular-nums">{fmtInt(bi.totalResearchSnapshots)}</p></div></Card>
          <Card><div className="p-4"><p className="text-xs text-muted-foreground">Completed Snapshots</p><p className="text-xl font-semibold tabular-nums">{fmtInt(bi.completedSnapshots)}</p></div></Card>
        </div>
        <Card><div className="p-4">
          <div className="mb-3 flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Business Profiles</h3></div>
          {bi.profiles.length === 0 ? <p className="py-4 text-center text-[11px] text-muted-foreground">No profiles created yet.</p> : (
            <ul className="space-y-2">{bi.profiles.map(p => (
              <li key={p.id} className="rounded-md border border-border p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-medium">{p.name}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {p.isDefault && <Badge variant="outline" className="text-[10px]">default</Badge>}
                    <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>{p.userEmail}</span>
                  {p.industry && <span>· {p.industry}</span>}
                  <span>· {fmtInt(p.webPropertyCount)} web props</span>
                  <span>· {fmtInt(p.researchSnapshotCount)} snapshots</span>
                  <span>· researched {timeAgo(p.lastResearchedAt)}</span>
                </div>
              </li>
            ))}</ul>
          )}
        </div></Card>
      </div>
    </CrmShell>
  );
}
