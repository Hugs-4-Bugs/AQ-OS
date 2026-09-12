'use client';

import React from 'react';
import { RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { GmailSyncStatus } from '@/lib/api';

interface GmailSyncStatusIndicatorProps {
  status: GmailSyncStatus | undefined;
  onSyncNow: () => void;
  isSyncing: boolean;
  compact?: boolean;
}

function getRelativeTime(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function GmailSyncStatusIndicator({
  status,
  onSyncNow,
  isSyncing,
  compact = false,
}: GmailSyncStatusIndicatorProps) {
  const syncStatus = status?.syncStatus ?? 'idle';
  const lastSyncAt = status?.lastSyncAt;
  const errorMessage = status?.errorMessage;

  // Determine dot color
  const dotColor = (() => {
    if (syncStatus === 'syncing') return 'bg-amber-500';
    if (syncStatus === 'error' || !status?.connected) return 'bg-red-500';
    // Green if synced within the last 30 minutes
    if (lastSyncAt) {
      const diff = Date.now() - new Date(lastSyncAt).getTime();
      if (diff < 30 * 60 * 1000) return 'bg-emerald-500';
    }
    return 'bg-amber-500';
  })();

  const statusText = (() => {
    if (syncStatus === 'syncing') return 'Syncing...';
    if (syncStatus === 'error') return 'Sync error';
    return `Synced ${getRelativeTime(lastSyncAt)}`;
  })();

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSyncNow}
            disabled={isSyncing}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted',
              isSyncing && 'cursor-wait'
            )}
            aria-label="Sync inbox"
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', dotColor, syncStatus === 'syncing' && 'animate-pulse')} />
            <span className="text-muted-foreground hidden sm:inline">{statusText}</span>
            <RefreshCw className={cn('h-3 w-3 text-muted-foreground', isSyncing && 'animate-spin')} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {errorMessage ? (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {errorMessage}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Last synced: {getRelativeTime(lastSyncAt)}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dotColor, syncStatus === 'syncing' && 'animate-pulse')} />
        <span className="text-sm text-muted-foreground">{statusText}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={onSyncNow}
        disabled={isSyncing}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
        Sync
      </Button>
      {errorMessage && (
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertCircle className="h-4 w-4 text-destructive cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">{errorMessage}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
