'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { AcquisitionFunnel } from '@/components/admin/crm/acquisition-funnel';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtInt, fmtMoney, useFetch, humanize } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';

export default function PipelinePage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Pipeline"><CrmLoadingSkeleton variant="overview" /></CrmShell>;
  if (error || !data) return <CrmShell title="Pipeline"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  return (
    <CrmShell title="Pipeline" subtitle="Lead distribution by lifecycle stage + deal value" onRefresh={reload}>
      <div className="space-y-3">
        <CrmKpiGrid kpis={data.kpis.filter(k => ['pipeline_value','active_deals','won_deals','total_leads','contacted_leads'].includes(k.key))} />
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2"><AcquisitionFunnel stages={data.funnel} /></div>
          <Card><div className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Pipeline Stages</h3>
            <ul className="space-y-2">
              {data.pipeline.stages.map(s => (
                <li key={s.stage} className="flex items-center justify-between text-xs">
                  <span>{s.label}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{fmtInt(s.leadCount)} leads</Badge>
                    {s.dealCount > 0 && <Badge variant="outline" className="text-[10px]">{fmtMoney(s.dealValue)}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-border pt-2 text-xs">
              <p className="flex justify-between"><span className="text-muted-foreground">Total Pipeline Value</span><span className="font-semibold">{fmtMoney(data.pipeline.totalPipelineValue)}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Active Deals</span><span className="font-semibold">{fmtInt(data.pipeline.activeDealCount)}</span></p>
            </div>
          </div></Card>
        </div>
      </div>
    </CrmShell>
  );
}
