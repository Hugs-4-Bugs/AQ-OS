'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFetch, fmtDateTime, timeAgo, humanize } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';
import { Activity } from 'lucide-react';
import Link from 'next/link';

export default function ActivitiesPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Activities"><CrmLoadingSkeleton variant="table" /></CrmShell>;
  if (error || !data) return <CrmShell title="Activities"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  return (
    <CrmShell title="Activities" subtitle="LeadActivity audit timeline across all tenants" onRefresh={reload}>
      <Card className="overflow-hidden">
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <Badge variant="outline" className="text-[10px]">{data.recentActivity.length} shown</Badge>
          </div>
          {data.recentActivity.length === 0 ? (
            <CrmEmptyState title="No activity recorded" description="Activities will appear here as the system processes leads." />
          ) : (
            <ul className="space-y-2">
              {data.recentActivity.map(a => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs">
                      <Link href={`/admin/crm/leads?id=${a.leadId}`} className="font-medium hover:underline">{a.leadBusinessName}</Link>
                      <span className="ml-1.5 text-muted-foreground">· {humanize(a.type)}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{a.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-muted-foreground">{a.actorEmail || 'system'}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </CrmShell>
  );
}
