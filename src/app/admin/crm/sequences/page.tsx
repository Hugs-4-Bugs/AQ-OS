'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFetch } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';

export default function SequencesPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Sequences"><CrmLoadingSkeleton variant="cards" /></CrmShell>;
  if (error || !data) return <CrmShell title="Sequences"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  return (
    <CrmShell title="Outreach Sequences" subtitle="Active sequences, enrollment, completion, reply rates" onRefresh={reload}>
      <CrmEmptyState title="Sequence analytics coming soon" description="The OutreachSequence + SequenceEnrollment models are wired. Performance breakdown (enrollment, completion, reply rate by sequence) will be added in the next iteration. Current outreach message count is shown on the Outreach page." />
    </CrmShell>
  );
}
