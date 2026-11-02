'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { CrmKpiGrid } from '@/components/admin/crm/crm-kpi-card';
import { useFetch } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';

export default function MeetingsPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Meetings"><CrmLoadingSkeleton variant="cards" /></CrmShell>;
  if (error || !data) return <CrmShell title="Meetings"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const meetingKpis = data.kpis.filter(k => k.key === 'meetings');
  return (
    <CrmShell title="Meetings" subtitle="Today, upcoming, completed, cancelled" onRefresh={reload}>
      <div className="space-y-3">
        <CrmKpiGrid kpis={meetingKpis} />
        <CrmEmptyState title="No meetings scheduled" description="Meetings will appear here once prospects progress to the meeting stage. The Meeting model is fully wired — data will populate as meetings are created." />
      </div>
    </CrmShell>
  );
}
