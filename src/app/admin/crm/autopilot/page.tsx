'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState } from '@/components/admin/crm/crm-states';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFetch, fmtInt, timeAgo, humanize } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';
import { Bot } from 'lucide-react';

export default function AutopilotPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="AI / Autopilot"><CrmLoadingSkeleton variant="overview" /></CrmShell>;
  if (error || !data) return <CrmShell title="AI / Autopilot"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const apKpis = data.kpis.filter(k => k.key === 'active_autopilot');
  return (
    <CrmShell title="AI / Autopilot" subtitle="Automation status: is AcquisitionOS actively acquiring?" onRefresh={reload}>
      <div className="space-y-3">
        <CrmKpiGrid kpis={apKpis} />
        <div className="grid gap-3 lg:grid-cols-2">
          <Card><div className="p-4">
            <div className="mb-3 flex items-center gap-2"><Bot className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">Workflows</h3></div>
            {data.autopilot.workflows.length === 0 ? <p className="py-4 text-center text-[11px] text-muted-foreground">No workflows configured.</p> : (
              <ul className="space-y-2">{data.autopilot.workflows.map(w => (
                <li key={w.id} className="rounded-md border border-border p-2.5">
                  <div className="mb-1 flex items-center justify-between gap-2"><span className="min-w-0 truncate text-xs font-medium">{w.name}</span><Badge variant="outline" className="text-[10px]">{w.status}</Badge></div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>schedule: {w.schedule}</span>
                    <span>runs: {fmtInt(w.runCount)}</span>
                    <span>discovered: {fmtInt(w.totalDiscovered)}</span>
                    <span>saved: {fmtInt(w.totalSaved)}</span>
                    <span>last run: {timeAgo(w.lastRunAt)}</span>
                    {w.nextRunAt && <span>next: {timeAgo(w.nextRunAt)}</span>}
                  </div>
                  {w.lastError && <p className="mt-1 truncate text-[10px] text-rose-500">⚠ {w.lastError}</p>}
                </li>
              ))}</ul>
            )}
          </div></Card>
          <Card><div className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Runs by Status</h3>
            {data.autopilot.runsByStatus.length === 0 ? <p className="py-4 text-center text-[11px] text-muted-foreground">No runs recorded.</p> : (
              <ul className="space-y-1.5">{data.autopilot.runsByStatus.map(r => (
                <li key={r.status} className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{humanize(r.status)}</span><span className="tabular-nums font-medium">{fmtInt(r.count)}</span></li>
              ))}</ul>
            )}
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-xs"><span className="text-muted-foreground">Total runs:</span> <span className="font-semibold tabular-nums">{fmtInt(data.autopilot.totalRuns)}</span></p>
              <p className="text-xs"><span className="text-muted-foreground">Failed (recent):</span> <span className="font-semibold tabular-nums text-rose-500">{fmtInt(data.autopilot.failedRunsRecent)}</span></p>
            </div>
          </div></Card>
        </div>
      </div>
    </CrmShell>
  );
}
