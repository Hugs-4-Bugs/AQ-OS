'use client';

import React from 'react';
import { CrmShell } from '@/components/admin/crm/crm-shell';
import { CrmLoadingSkeleton, CrmErrorState, CrmEmptyState } from '@/components/admin/crm/crm-states';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFetch } from '@/components/admin/crm/crm-utils';
import type { CrmOverview } from '@/lib/admin/crm/crm-types';
import { BellRing, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export default function TasksPage() {
  const { data, loading, error, reload } = useFetch<CrmOverview>('/api/admin/crm/overview');
  if (loading) return <CrmShell title="Tasks & Follow-ups"><CrmLoadingSkeleton variant="cards" /></CrmShell>;
  if (error || !data) return <CrmShell title="Tasks & Follow-ups"><CrmErrorState message={error || 'Failed'} onRetry={reload} /></CrmShell>;
  const taskSchemaDrift = data.schemaDrift.includes('Task');
  const needsAttention = data.needsAttention.filter(n => ['overdue_followups','overdue_tasks'].includes(n.key));
  return (
    <CrmShell title="Tasks & Follow-ups" subtitle="Actionable work + time-bound reminders" onRefresh={reload}>
      <div className="space-y-3">
        {taskSchemaDrift && (
          <Card className="border-sky-500/30 bg-sky-500/5">
            <div className="flex items-start gap-3 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
              <div className="text-xs">
                <p className="font-medium text-sky-700 dark:text-sky-300">Task table missing from DB</p>
                <p className="mt-0.5 text-sky-700/80 dark:text-sky-300/80">The Task model is declared in the Prisma schema but the table hasn't been pushed to SQLite. FollowUpReminder data is available. Run <code className="rounded bg-sky-500/10 px-1">npx prisma db push</code> (additive) to enable Task features.</p>
              </div>
            </div>
          </Card>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><div className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <div><p className="text-xs text-muted-foreground">Overdue Follow-ups</p><p className="text-xl font-semibold tabular-nums">{needsAttention.find(n => n.key === 'overdue_followups')?.count || 0}</p></div>
          </div></Card>
          <Card><div className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-500" aria-hidden="true" />
            <div><p className="text-xs text-muted-foreground">Overdue Tasks</p><p className="text-xl font-semibold tabular-nums">{needsAttention.find(n => n.key === 'overdue_tasks')?.count || 0}</p></div>
          </div></Card>
          <Card><div className="p-4 flex items-center gap-3">
            <BellRing className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div><p className="text-xs text-muted-foreground">Schema Status</p><p className="text-sm font-medium">{taskSchemaDrift ? 'Task table missing' : 'OK'}</p></div>
          </div></Card>
        </div>
        <CrmEmptyState title="Full task queue coming soon" description="The Task model needs to be pushed to the DB (additive) before the full task queue can render. Follow-up reminders are tracked via the FollowUpReminder model and surfaced in Needs Attention." />
      </div>
    </CrmShell>
  );
}
