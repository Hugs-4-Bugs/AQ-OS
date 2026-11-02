'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { useFetch, fmtInt, fmtMoney, humanize } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';

export default function DealsPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Deals"><CrmLoadingSkeleton variant="cards" /></CrmShell>;
  if (error || !data) return <CrmShell title="Deals"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const dealKpis = data.kpis.filter(k => ['active_deals','won_deals','pipeline_value','conversion_rate'].includes(k.key));
  return (
    <CrmShell title="Deals" subtitle="Commercial opportunities across all tenants" onRefresh={reload}>
      <div className="space-y-3">
        <CrmKpiGrid kpis={dealKpis} />
        {data.pipeline.activeDealCount === 0 ? (
          <CrmEmptyState title="No deals yet" description="Deals will appear here once prospects progress to the proposal stage. Active deals are surfaced from the Deal model." />
        ) : (
          <CrmEmptyState title="Deal detail view" description="Full deal table with filtering by status, value, and stage coming in the next iteration. Use the Pipeline page for stage-level visibility." />
        )}
      </div>
    </CrmShell>
  );
}
