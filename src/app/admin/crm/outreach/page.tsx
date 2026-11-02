'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState } from '@/components/admin/crm/crm-states';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFetch, fmtInt, humanize } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';
import { Send } from 'lucide-react';

export default function OutreachPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Outreach"><CrmLoadingSkeleton variant="overview" /></CrmShell>;
  if (error || !data) return <CrmShell title="Outreach"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const outreachKpis = data.kpis.filter(k => ['replies','reply_rate'].includes(k.key));
  return (
    <CrmShell title="Outreach" subtitle="Outbound communication performance by channel + status" onRefresh={reload}>
      <div className="space-y-3">
        <CrmKpiGrid kpis={outreachKpis} />
        <div className="grid gap-3 lg:grid-cols-2">
          <Card><div className="p-4">
            <div className="mb-3 flex items-center gap-2"><Send className="h-4 w-4 text-muted-foreground" /><h3 className="text-sm font-semibold">By Status</h3></div>
            {data.outreach.byStatus.length === 0 ? <p className="py-4 text-center text-[11px] text-muted-foreground">No outreach messages.</p> : (
              <ul className="space-y-1.5">{data.outreach.byStatus.map(s => (
                <li key={s.status} className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{humanize(s.status)}</span><span className="tabular-nums font-medium">{fmtInt(s.count)}</span></li>
              ))}</ul>
            )}
          </div></Card>
          <Card><div className="p-4">
            <h3 className="mb-3 text-sm font-semibold">By Channel</h3>
            {data.outreach.byChannel.length === 0 ? <p className="py-4 text-center text-[11px] text-muted-foreground">No channels used.</p> : (
              <ul className="space-y-2">{data.outreach.byChannel.map(c => (
                <li key={c.channel} className="rounded-md border border-border p-2">
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="font-medium capitalize">{c.channel}</span><Badge variant="outline" className="text-[10px]">{fmtInt(c.sent)} sent</Badge></div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>delivered: {c.delivered}</span><span>opened: {c.opened}</span><span>replied: {c.replied}</span>{c.failed > 0 && <span className="text-rose-500">failed: {c.failed}</span>}
                  </div>
                </li>
              ))}</ul>
            )}
          </div></Card>
        </div>
      </div>
    </CrmShell>
  );
}
