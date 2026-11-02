'use client';

// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — CRM Loading / Empty / Error States
// Polished, accessible, consistent across every CRM section.
// ═══════════════════════════════════════════════════════════════════

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, RefreshCw, Inbox } from 'lucide-react';

// ── Loading skeleton ──────────────────────────────────────────────────

export function CrmLoadingSkeleton({ variant = 'overview' }: { variant?: 'overview' | 'table' | 'cards' }) {
  if (variant === 'overview') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading CRM overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <div className="space-y-2 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            </Card>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-2"><div className="p-4"><Skeleton className="h-64" /></div></Card>
          <Card><div className="p-4"><Skeleton className="h-64" /></div></Card>
        </div>
        <Card><div className="p-4"><Skeleton className="h-48" /></div></Card>
      </div>
    );
  }
  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}><div className="space-y-2 p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-16" /></div></Card>
        ))}
      </div>
    );
  }
  // table
  return (
    <Card aria-busy="true">
      <div className="p-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    </Card>
  );
}

// ── Error state ───────────────────────────────────────────────────────

export function CrmErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">Something went wrong</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

export function CrmEmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
    </Card>
  );
}
