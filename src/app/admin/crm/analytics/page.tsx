'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState } from '@/components/admin/crm/crm-states';
import { AcquisitionFunnel } from '@/components/admin/crm/acquisition-funnel';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { useFetch } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';

export default function AnalyticsPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Analytics"><CrmLoadingSkeleton variant="overview" /></CrmShell>;
  if (error || !data) return <CrmShell title="Analytics"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const analyticsKpis = data.kpis.filter(k => ['total_leads','contacted_leads','replies','conversion_rate','reply_rate'].includes(k.key));
  return (
    <CrmShell title="Analytics" subtitle="Funnel, conversion, velocity, aging" onRefresh={reload}>
      <div className="space-y-3">
        <CrmKpiGrid kpis={analyticsKpis} />
        <AcquisitionFunnel stages={data.funnel} />
        <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Time-series charts (leads/discovered/contacted/replied over time, 7D/30D/90D ranges) + velocity metrics (time-to-first-contact, time-to-reply, time-to-meeting) coming in the next iteration. The current funnel shows real conversion data from production.
        </div>
      </div>
    </CrmShell>
  );
}
